import { Link } from 'react-router-dom';
import WeatherCard from '../../components/WeatherCard.jsx';
import { PageHeader } from '../../components/ui.jsx';

export default function FarmerWeather() {
  return (
    <>
      <PageHeader title="Weather at my farm" subtitle="Based on the location saved in your profile." actions={<Link className="btn-secondary btn-sm" to="/farmer/profile">Change location</Link>} />
      <WeatherCard path="/weather/me" />
      <p className="mt-3 text-sm text-gray-500">Weather alerts are general guidance only. For decisions about your fields, <Link className="underline" to="/farmer/chat">contact your agent</Link>.</p>
    </>
  );
}
